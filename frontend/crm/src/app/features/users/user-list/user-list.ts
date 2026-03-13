import { Component, OnInit, OnDestroy } from '@angular/core';
import { UserService } from '../../../shared/services/user';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';


@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.html',
  styleUrls: ['./user-list.scss'],
  standalone:false
})
export class UserListComponent implements OnInit, OnDestroy {
  users: any[] = [];
  filteredUsers: any[] = [];
  searchTerm: string = '';
  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    this.loadUsers();
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(term => {
      this.loadUsers(term);
    });
  }

  ngOnDestroy(): void {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  loadUsers(search?: string): void {
    this.userService.getUsers(search).subscribe({
      next: (data) => {
        this.users = data;
        this.filteredUsers = [...this.users];
      },
      error: (error) => {
        console.error('Error loading users:', error);
      }
    });
  }

  onSearch(): void {
    this.searchSubject.next(this.searchTerm);
  }

  // Legacy client-side filter kept for reference but unused
  filterUsers(): void {
    this.onSearch();
  }

  deleteUser(userId: string): void {
    if (confirm('Are you sure you want to delete this user?')) {
      this.userService.deleteUser(parseInt(userId)).subscribe({
        next: () => {
          this.loadUsers(this.searchTerm); // Reload with current search
        },
        error: (error) => {
          console.error('Error deleting user:', error);
        }
      });
    }
  }
}
